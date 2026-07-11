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

// Human-readable labels, shared so the signup form can show a "your vehicle
// at a glance" summary without re-declaring them.
export const VEHICLE_TYPE_LABELS = {
    [TRUCK]: 'Truck',
    [BIKE]: 'Bike',
    [CAR]: 'Car',
}

const MODEL_PLACEHOLDER = {
    [TRUCK]: 'Truck model (e.g. Tata Ace)',
    [BIKE]: 'Bike model (e.g. Yamaha FZ)',
    [CAR]: 'Car model (e.g. Toyota Axio)',
}

const TYPE_HELP = {
    [TRUCK]:
        'Trucks carry pooled goods. Enter your truck’s max load so goods rides can be matched to your free cargo space.',
    [BIKE]: 'Bikes are for you plus a small item - passengers and cargo only, no freight.',
    [CAR]: 'Cars carry you and a few coworkers. Passengers only, no freight.',
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
            <p className="text-xs text-gray-400 -mt-1">
                {TYPE_HELP[form.vehicleType]}
            </p>
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
                    <div>
                        <Input
                            type="number"
                            min="1"
                            placeholder="Max load (kg)"
                            value={form.maxWeightKg}
                            onChange={setField('maxWeightKg')}
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                            Heaviest load your truck can carry
                        </p>
                    </div>
                    <div>
                        <Input
                            type="number"
                            min="0.1"
                            step="0.1"
                            placeholder="Cargo space (m³)"
                            value={form.maxVolumeM3}
                            onChange={setField('maxVolumeM3')}
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                            Total cargo volume (length × width × height)
                        </p>
                    </div>
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
            <p className="text-[11px] text-gray-400 -mt-1">
                Including yourself - how many people can ride at once.
            </p>
        </div>
    )
}

export default VehicleDetailsFields
