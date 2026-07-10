import { useCallback, useRef, useState } from 'react'
import { TbCurrentLocation } from 'react-icons/tb'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const SEARCH_TIMEOUT_MS = 8000

const PlaceSearchInput = ({ placeholder, proximity, onPlaceSelect }) => {
    const [query, setQuery] = useState('')
    const [suggestions, setSuggestions] = useState([])
    const [open, setOpen] = useState(false)
    const [searching, setSearching] = useState(false)
    const [searchError, setSearchError] = useState(false)
    const [locatingCurrent, setLocatingCurrent] = useState(false)
    const debounceRef = useRef(null)
    const requestIdRef = useRef(0)

    const search = useCallback(
        (text) => {
            if (!text || text.length < 3) {
                setSuggestions([])
                setSearching(false)
                setSearchError(false)
                return
            }

            const params = new URLSearchParams({
                access_token: MAPBOX_TOKEN,
                autocomplete: 'true',
                limit: '5',
                country: 'bd',
            })
            if (proximity) {
                params.set('proximity', `${proximity.lng},${proximity.lat}`)
            }

            const requestId = ++requestIdRef.current
            setSearching(true)
            setSearchError(false)

            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)

            fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?${params}`,
                { signal: controller.signal },
            )
                .then((res) => res.json())
                .then((data) => {
                    if (requestId !== requestIdRef.current) return
                    setSuggestions(data.features || [])
                    setOpen(true)
                    setSearching(false)
                })
                .catch(() => {
                    if (requestId !== requestIdRef.current) return
                    setSuggestions([])
                    setSearching(false)
                    setSearchError(true)
                })
                .finally(() => clearTimeout(timeout))
        },
        [proximity],
    )

    const handleChange = (e) => {
        const value = e.target.value
        setQuery(value)
        setSearchError(false)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => search(value), 300)
    }

    const handleSelect = (feature) => {
        setQuery(feature.place_name)
        setSuggestions([])
        setOpen(false)
        onPlaceSelect({
            lat: feature.center[1],
            lng: feature.center[0],
            address: feature.place_name,
        })
    }

    const handleUseCurrentLocation = () => {
        if (!navigator.geolocation) {
            setSearchError(true)
            return
        }
        setLocatingCurrent(true)
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocatingCurrent(false)
                setOpen(false)
                setQuery('Current location')
                setSuggestions([])
                onPlaceSelect({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    address: 'Current location',
                })
            },
            () => {
                setLocatingCurrent(false)
                setSearchError(true)
            },
        )
    }

    return (
        <div className="relative">
            <div className="relative">
                <Input
                    value={query}
                    placeholder={placeholder}
                    autoComplete="off"
                    onChange={handleChange}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                />
                {searching && (
                    <Spinner
                        size={16}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                    />
                )}
            </div>
            {open && (
                <ul className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                    <li
                        className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer text-emerald-600 hover:bg-emerald-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
                        onMouseDown={handleUseCurrentLocation}
                    >
                        {locatingCurrent ? (
                            <Spinner size={16} />
                        ) : (
                            <TbCurrentLocation size={16} />
                        )}
                        Use current location
                    </li>
                    {suggestions.map((feature) => (
                        <li
                            key={feature.id}
                            className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                            onMouseDown={() => handleSelect(feature)}
                        >
                            {feature.place_name}
                        </li>
                    ))}
                </ul>
            )}
            {searchError && (
                <p className="text-xs text-red-500 mt-1">
                    Search failed - check your connection, or use &quot;pick a
                    point on the map&quot; below instead.
                </p>
            )}
        </div>
    )
}

export default PlaceSearchInput
