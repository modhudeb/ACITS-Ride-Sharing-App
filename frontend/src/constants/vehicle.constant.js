export const TRUCK = 'truck'
export const BIKE = 'bike'
export const CAR = 'car'

export const VEHICLE_TYPES = [TRUCK, BIKE, CAR]

// Passenger seat defaults/caps per type - trucks/cars can carry a small
// group, a bike realistically carries the rider only.
export const VEHICLE_PASSENGER_LIMITS = {
    [TRUCK]: { default: 2, max: 6 },
    [BIKE]: { default: 1, max: 1 },
    [CAR]: { default: 4, max: 6 },
}
