import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Radio from '@/components/ui/Radio'
import { FormItem, Form } from '@/components/ui/Form'
import { useAuth } from '@/auth'
import { apiSetVehicleDetails } from '@/services/DriverService'
import VehicleDetailsFields, {
    emptyVehicleForm,
    isVehicleFormValid,
} from '@/components/shared/VehicleDetailsFields'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PASSENGER, DRIVER } from '@/constants/roles.constant'
import { VEHICLE_PASSENGER_LIMITS } from '@/constants/vehicle.constant'

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
        const result = await signUp({ userName, password, email, role })

        if (result?.status === 'failed') {
            setMessage?.(result.message)
            setSubmitting(false)
            return
        }

        if (role === DRIVER) {
            try {
                await apiSetVehicleDetails({
                    vehicleType: vehicleForm.vehicleType,
                    vehicleModel: vehicleForm.vehicleModel.trim(),
                    plateNumber: vehicleForm.plateNumber.trim(),
                    maxWeightKg: Number(vehicleForm.maxWeightKg) || undefined,
                    maxVolumeM3: Number(vehicleForm.maxVolumeM3) || undefined,
                    maxPassengers: Number(vehicleForm.maxPassengers),
                })
            } catch {
                // Account creation already succeeded - DriverHome's fallback
                // vehicle setup card lets them redo this if it failed here.
            }
        }

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
                    {isSubmitting ? 'Creating Account...' : 'Sign Up'}
                </Button>
            </Form>
        </div>
    )
}

export default SignUpForm
