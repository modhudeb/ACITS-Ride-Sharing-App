import { TbTruck, TbMotorbike, TbCar } from 'react-icons/tb'
import Input from '@/components/ui/Input'
import Segment from '@/components/ui/Segment'
import classNames from '@/utils/classNames'
import {
    TRUCK,
    BIKE,
    CAR,
    VEHICLE_PASSENGER_LIMITS,
} from '@/constants/vehicle.constant'

const VEHICLE_TYPE_OPTIONS = [
    { value: TRUCK, label: 'Truck', icon: TbTruck },
    { value: BIKE, label: 'Bike', icon: TbMotorbike },
    { value: CAR, label: 'Car', icon: TbCar },
]

const MODEL_PLACEHOLDER = {
    [TRUCK]: 'Truck model (e.g. Tata Ace)',
    [BIKE]: 'Bike model (e.g. Yamaha FZ)',
    [CAR]: 'Car model (e.g. Toyota Axio)',
}

export const emptyVehicleForm = {
    vehicleType: TRUCK,
    vehicleModel: '',
    plateNumber: '',
    maxWeightKg: '',
    maxVolumeM3: '',
    maxPassengers: String(VEHICLE_PASSENGER_LIMITS[TRUCK].default),
}

export const isVehicleFormValid = (form) => {
    const limits = VEHICLE_PASSENGER_LIMITS[form.vehicleType]
    const passengersOk =
        Number(form.maxPassengers) >= 1 &&
        Number(form.maxPassengers) <= limits.max
    const baseOk = Boolean(
        form.vehicleModel.trim() && form.plateNumber.trim() && passengersOk,
    )

    if (form.vehicleType === TRUCK) {
        return (
            baseOk &&
            Number(form.maxWeightKg) > 0 &&
            Number(form.maxVolumeM3) > 0
        )
    }

    return baseOk
}

// Shared by the driver signup form and DriverHome's fallback setup card, so
// the truck/bike/car field logic (and the kg/m3-only-for-trucks rule) only
// lives in one place.
const VehicleDetailsFields = ({ form, setField, onVehicleTypeChange }) => {
    const limits = VEHICLE_PASSENGER_LIMITS[form.vehicleType] || VEHICLE_PASSENGER_LIMITS[TRUCK]

    const handleTypeChange = (value) => {
        const type = Array.isArray(value) ? value[0] : value
        if (!type) return
        onVehicleTypeChange(type)
    }

    return (
        <div className="flex flex-col gap-2">
            <Segment value={form.vehicleType} onChange={handleTypeChange} className="w-full">
                {VEHICLE_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                    <Segment.Item key={value} value={value}>
                        {({ active, onSegmentItemClick }) => (
                            <button
                                type="button"
                                onClick={onSegmentItemClick}
                                className={classNames(
                                    'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                                    active
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400',
                                )}
                            >
                                <Icon size={16} />
                                {label}
                            </button>
                        )}
                    </Segment.Item>
                ))}
            </Segment>
            <Input
                placeholder={MODEL_PLACEHOLDER[form.vehicleType]}
                value={form.vehicleModel}
                onChange={setField('vehicleModel')}
            />
            <Input
                placeholder="Plate number"
                value={form.plateNumber}
                onChange={setField('plateNumber')}
            />
            {form.vehicleType === TRUCK && (
                <div className="grid grid-cols-2 gap-2">
                    <Input
                        type="number"
                        min="1"
                        placeholder="Max load (kg)"
                        value={form.maxWeightKg}
                        onChange={setField('maxWeightKg')}
                    />
                    <Input
                        type="number"
                        min="0.1"
                        step="0.1"
                        placeholder="Cargo space (m³)"
                        value={form.maxVolumeM3}
                        onChange={setField('maxVolumeM3')}
                    />
                </div>
            )}
            <Input
                type="number"
                min="1"
                max={limits.max}
                placeholder={`Passenger seats (max ${limits.max})`}
                value={form.maxPassengers}
                onChange={setField('maxPassengers')}
            />
        </div>
    )
}

export default VehicleDetailsFields
