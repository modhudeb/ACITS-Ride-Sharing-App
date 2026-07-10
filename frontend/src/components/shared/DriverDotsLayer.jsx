import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'

// GPU-rendered dots for a fleet of driver points, with automatic clustering
// when zoomed out. Replaces one <Marker> DOM node per driver (which the map
// library repositions on every pan/zoom) with a single GeoJSON layer the GPU
// handles - the right tradeoff once a map is showing more than a handful of
// points at once.
const clusterCircleLayer = (id, color) => ({
    id: `${id}-clusters`,
    type: 'circle',
    filter: ['has', 'point_count'],
    paint: {
        'circle-color': color,
        'circle-opacity': 0.85,
        'circle-radius': [
            'step',
            ['get', 'point_count'],
            16, // < 10 drivers
            10,
            22, // 10-25 drivers
            25,
            28, // 25+ drivers
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
    },
})

const clusterCountLayer = (id) => ({
    id: `${id}-cluster-count`,
    type: 'symbol',
    filter: ['has', 'point_count'],
    layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-size': 12,
        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
    },
    paint: { 'text-color': '#ffffff' },
})

const pointLayer = (id, color) => ({
    id: `${id}-point`,
    type: 'circle',
    filter: ['!', ['has', 'point_count']],
    paint: {
        'circle-color': color,
        'circle-radius': 7,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
    },
})

const DriverDotsLayer = ({ id, drivers, color = '#9333ea' }) => {
    const geojson = useMemo(
        () => ({
            type: 'FeatureCollection',
            features: drivers.map((driver) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [driver.location.lng, driver.location.lat],
                },
                properties: { uid: driver.uid },
            })),
        }),
        [drivers],
    )

    return (
        <Source
            id={id}
            type="geojson"
            data={geojson}
            cluster={true}
            clusterMaxZoom={14}
            clusterRadius={45}
        >
            <Layer {...clusterCircleLayer(id, color)} />
            <Layer {...clusterCountLayer(id)} />
            <Layer {...pointLayer(id, color)} />
        </Source>
    )
}

export default DriverDotsLayer
