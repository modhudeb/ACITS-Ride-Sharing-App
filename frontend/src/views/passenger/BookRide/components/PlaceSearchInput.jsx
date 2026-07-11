import { useCallback, useRef, useState } from 'react'
import { TbCurrentLocation } from 'react-icons/tb'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const SEARCH_TIMEOUT_MS = 8000
const RESULT_LIMIT = 8

// Primary geocoder: Photon (photon.komoot.io) - OpenStreetMap data, which is
// much denser in Bangladesh than Mapbox's commercial POI set, and its public
// instance is free with no API key. Mapbox stays as an automatic fallback so
// search still works if the public Photon instance is down or slow.
async function searchPhoton(text, proximity, signal) {
    const params = new URLSearchParams({ q: text, limit: String(RESULT_LIMIT), lang: 'en' })
    if (proximity) {
        params.set('lat', String(proximity.lat))
        params.set('lon', String(proximity.lng))
    }
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal })
    if (!res.ok) throw new Error(`photon ${res.status}`)
    const data = await res.json()

    const results = []
    const seen = new Set()
    for (const feature of data.features || []) {
        const props = feature.properties || {}
        if (props.countrycode && props.countrycode !== 'BD') continue
        const [lng, lat] = feature.geometry?.coordinates || []
        if (lat == null || lng == null) continue

        const label = [props.name, props.street, props.district, props.city, props.state]
            .filter(Boolean)
            .filter((part, i, arr) => arr.indexOf(part) === i)
            .join(', ')
        if (!label) continue

        const key = props.osm_id ? `osm-${props.osm_type}-${props.osm_id}` : `${lat},${lng}`
        if (seen.has(key)) continue
        seen.add(key)
        results.push({ id: key, label, lat, lng })
    }
    return results
}

async function searchMapbox(text, proximity, signal) {
    const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        autocomplete: 'true',
        limit: '5',
        country: 'bd',
    })
    if (proximity) {
        params.set('proximity', `${proximity.lng},${proximity.lat}`)
    }
    const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?${params}`,
        { signal },
    )
    if (!res.ok) throw new Error(`mapbox ${res.status}`)
    const data = await res.json()
    return (data.features || []).map((feature) => ({
        id: feature.id,
        label: feature.place_name,
        lat: feature.center[1],
        lng: feature.center[0],
    }))
}

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

            const requestId = ++requestIdRef.current
            setSearching(true)
            setSearchError(false)

            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)

            searchPhoton(text, proximity, controller.signal)
                .then((results) => {
                    // Photon reachable but nothing found - give Mapbox a shot
                    // rather than showing an empty dropdown.
                    if (results.length === 0) {
                        return searchMapbox(text, proximity, controller.signal)
                    }
                    return results
                })
                .catch(() => searchMapbox(text, proximity, controller.signal))
                .then((results) => {
                    if (requestId !== requestIdRef.current) return
                    setSuggestions(results)
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

    const handleSelect = (place) => {
        setQuery(place.label)
        setSuggestions([])
        setOpen(false)
        onPlaceSelect({
            lat: place.lat,
            lng: place.lng,
            address: place.label,
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
                    {suggestions.map((place) => (
                        <li
                            key={place.id}
                            className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                            onMouseDown={() => handleSelect(place)}
                        >
                            {place.label}
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
