import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Radio from '@/components/ui/Radio'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem, Form } from '@/components/ui/Form'
import { useAuth } from '@/auth'
import { apiSetVehicleDetails } from '@/services/DriverService'
import VehicleDetailsFields, {
    emptyVehicleForm,
    isVehicleFormValid,
    VEHICLE_TYPE_LABELS,
} from '@/components/shared/VehicleDetailsFields'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PASSENGER, DRIVER } from '@/constants/roles.constant'
import { VEHICLE_PASSENGER_LIMITS, TRUCK } from '@/constants/vehicle.constant'
import { getApiErrorMessage } from '@/utils/apiError'

const notify = (title, type) => {
    toast.push(<Notification title={title} type={type} />, {
        placement: 'top-center',
    })
}

// Only worth retrying on a network blip or a 5xx - a 4xx means the payload is
// bad and will keep failing, so surface it immediately instead.
const isTransientError = (err) => {
    const status = err?.response?.status
    return !err?.response || status >= 500
}

const validationSchema = z
    .object({
        email: z.email({ message: 'Please enter a valid email' }),
        userName: z.string().min(1, { message: 'Please enter your name' }),
        password: z.string().min(1, { message: 'Password required' }),
        confirmPassword: z.string().min(1, { message: 'Confirm Password Required' }),
        role: z.enum([PASSENGER, DRIVER]),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: 'Password not match',
        path: ['confirmPassword'],
    })

const SignUpForm = (props) => {
    const { disableSubmit = false, className, setMessage } = props

    const [isSubmitting, setSubmitting] = useState(false)
    const [savingVehicle, setSavingVehicle] = useState(false)
    const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm)

    const { signUp } = useAuth()

    const {
        handleSubmit,
        formState: { errors },
        control,
    } = useForm({
        defaultValues: {
            role: PASSENGER,
        },
        resolver: zodResolver(validationSchema),
    })

    const role = useWatch({ control, name: 'role' })
    const isDriver = role === DRIVER

    const setVehicleField = (field) => (e) =>
        setVehicleForm((f) => ({ ...f, [field]: e.target.value }))

    const handleVehicleTypeChange = (vehicleType) => {
        setVehicleForm((f) => ({
            ...f,
            vehicleType,
            maxPassengers: String(VEHICLE_PASSENGER_LIMITS[vehicleType].default),
        }))
    }

    const onSignUp = async (values) => {
        const { userName, password, email, role } = values

        if (disableSubmit) return
        if (role === DRIVER && !isVehicleFormValid(vehicleForm)) return

        setSubmitting(true)

        // Persist the vehicle profile as part of signup, BEFORE the redirect.
        // signUp waits for this (via onBeforeRedirect) so the driver lands on
        // DriverHome with the profile already on the backend row - no re-prompt.
        const saveVehicleDetails = async () => {
            setSavingVehicle(true)
            try {
                let lastErr
                for (let attempt = 1; attempt <= 2; attempt += 1) {
                    try {
                        await apiSetVehicleDetails({
                            vehicleType: vehicleForm.vehicleType,
                            vehicleModel: vehicleForm.vehicleModel.trim(),
                            plateNumber: vehicleForm.plateNumber.trim(),
                            maxWeightKg:
                                Number(vehicleForm.maxWeightKg) || undefined,
                            maxVolumeM3:
                                Number(vehicleForm.maxVolumeM3) || undefined,
                            maxPassengers: Number(vehicleForm.maxPassengers),
                        })
                        return
                    } catch (err) {
                        lastErr = err
                        if (!isTransientError(err)) throw err
                    }
                }
                throw lastErr
            } finally {
                setSavingVehicle(false)
            }
        }

        const result = await signUp(
            { userName, password, email, role },
            {
                onBeforeRedirect:
                    role === DRIVER ? saveVehicleDetails : undefined,
                onBeforeRedirectError: (err) => {
                    // Account was created; we still redirect (handled by
                    // signUp) and let DriverHome's setup card recover. Warn now.
                    notify(
                        getApiErrorMessage(
                            err,
                            'Could not save your vehicle details',
                        ) +
                            ' - you can set them up on the next screen.',
                        'warning',
                    )
                },
            },
        )

        if (result?.status === 'failed') {
            setMessage?.(result.message)
            setSubmitting(false)
            return
        }

        // Success: signUp already redirected. The toast (global, not tied to
        // this component) survives the navigation so the user sees confirmation.
        notify('Account created successfully', 'success')
        setSubmitting(false)
    }

    return (
        <div className={className}>
            <Form onSubmit={handleSubmit(onSignUp)}>
                <FormItem
                    label="User name"
                    invalid={Boolean(errors.userName)}
                    errorMessage={errors.userName?.message}
                >
                    <Controller
                        name="userName"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="text"
                                placeholder="User Name"
                                autoComplete="off"
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <FormItem label="I want to sign up as">
                    <Controller
                        name="role"
                        control={control}
                        render={({ field }) => (
                            <Radio.Group value={field.value} onChange={field.onChange}>
                                <Radio value={PASSENGER}>Rider</Radio>
                                <Radio value={DRIVER}>Driver</Radio>
                            </Radio.Group>
                        )}
                    />
                </FormItem>
                {isDriver && (
                    <FormItem label="Your vehicle">
                        <VehicleDetailsFields
                            form={vehicleForm}
                            setField={setVehicleField}
                            onVehicleTypeChange={handleVehicleTypeChange}
                        />
                        {isVehicleFormValid(vehicleForm) && (
                            <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-700 p-3 text-xs text-gray-600 dark:text-gray-300">
                                <p className="font-semibold mb-1">
                                    Your vehicle at a glance
                                </p>
                                <p>
                                    {VEHICLE_TYPE_LABELS[vehicleForm.vehicleType]}{' '}
                                    · {vehicleForm.vehicleModel.trim()} ·{' '}
                                    {vehicleForm.plateNumber.trim()}
                                </p>
                                <p className="mt-0.5">
                                    {vehicleForm.maxPassengers} passenger
                                    {Number(vehicleForm.maxPassengers) === 1
                                        ? ''
                                        : 's'}
                                    {vehicleForm.vehicleType === TRUCK &&
                                        ` · ${vehicleForm.maxWeightKg} kg / ${
                                            vehicleForm.maxVolumeM3
                                        } m³ cargo`}
                                </p>
                            </div>
                        )}
                    </FormItem>
                )}
                <FormItem
                    label="Email"
                    invalid={Boolean(errors.email)}
                    errorMessage={errors.email?.message}
                >
                    <Controller
                        name="email"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="email"
                                placeholder="Email"
                                autoComplete="off"
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <FormItem
                    label="Password"
                    invalid={Boolean(errors.password)}
                    errorMessage={errors.password?.message}
                >
                    <Controller
                        name="password"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="password"
                                autoComplete="off"
                                placeholder="Password"
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <FormItem
                    label="Confirm Password"
                    invalid={Boolean(errors.confirmPassword)}
                    errorMessage={errors.confirmPassword?.message}
                >
                    <Controller
                        name="confirmPassword"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="password"
                                autoComplete="off"
                                placeholder="Confirm Password"
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <Button
                    block
                    loading={isSubmitting}
                    variant="solid"
                    type="submit"
                    disabled={isDriver && !isVehicleFormValid(vehicleForm)}
                >
                    {savingVehicle
                        ? 'Saving vehicle details...'
                        : isSubmitting
                          ? 'Creating account...'
                          : 'Sign Up'}
                </Button>
            </Form>
        </div>
    )
}

export default SignUpForm
