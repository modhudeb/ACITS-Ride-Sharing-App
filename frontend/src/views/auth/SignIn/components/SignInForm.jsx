import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Segment from '@/components/ui/Segment'
import { FormItem, Form } from '@/components/ui/Form'
import PasswordInput from '@/components/shared/PasswordInput'
import classNames from '@/utils/classNames'
import { useAuth } from '@/auth'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TbUserCircle, TbSteeringWheel } from 'react-icons/tb'
import { PASSENGER, DRIVER } from '@/constants/roles.constant'

const validationSchema = z.object({
    email: z.email({ message: 'Please enter a valid email' }),
    password: z
        .string()
        .min(1, { message: 'Please enter your password' }),
})

const ROLE_OPTIONS = [
    { value: PASSENGER, label: 'Rider', icon: TbUserCircle },
    { value: DRIVER, label: 'Driver', icon: TbSteeringWheel },
]

const notify = (title, type) => {
    toast.push(<Notification title={title} type={type} />, {
        placement: 'top-center',
    })
}

const SignInForm = (props) => {
    const [isSubmitting, setSubmitting] = useState(false)
    const [role, setRole] = useState(PASSENGER)

    const { disableSubmit = false, className, setMessage, passwordHint } = props

    const {
        handleSubmit,
        formState: { errors },
        control,
    } = useForm({
        defaultValues: {
            email: '',
            password: '',
        },
        resolver: zodResolver(validationSchema),
    })

    const { signIn } = useAuth()

    const onSignIn = async (values) => {
        const { email, password } = values

        if (!disableSubmit) {
            setSubmitting(true)

            const result = await signIn({ email, password, role })

            if (result?.status === 'failed') {
                setMessage?.(result.message)
            } else if (result?.status === 'success') {
                notify('Signed in successfully', 'success')
            }
        }

        setSubmitting(false)
    }

    return (
        <div className={className}>
            <Form onSubmit={handleSubmit(onSignIn)}>
                <FormItem label="Login as">
                    <Segment
                        value={role}
                        onChange={(value) =>
                            setRole(Array.isArray(value) ? value[0] : value)
                        }
                        className="w-full"
                    >
                        {ROLE_OPTIONS.map(({ value, label, icon: Icon }) => (
                            <Segment.Item key={value} value={value}>
                                {({ active, onSegmentItemClick }) => (
                                    <button
                                        type="button"
                                        onClick={onSegmentItemClick}
                                        className={classNames(
                                            'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
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
                </FormItem>
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
                    className={classNames(
                        passwordHint ? 'mb-0' : '',
                        errors.password?.message ? 'mb-8' : '',
                    )}
                >
                    <Controller
                        name="password"
                        control={control}
                        rules={{ required: true }}
                        render={({ field }) => (
                            <PasswordInput
                                type="text"
                                placeholder="Password"
                                autoComplete="off"
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                {passwordHint}
                <Button
                    block
                    loading={isSubmitting}
                    variant="solid"
                    type="submit"
                >
                    {isSubmitting ? 'Signing in...' : 'Sign In'}
                </Button>
            </Form>
        </div>
    )
}

export default SignInForm
