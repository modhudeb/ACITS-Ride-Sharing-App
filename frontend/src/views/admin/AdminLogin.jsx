import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import Logo from '@/components/template/Logo'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import ActionLink from '@/components/shared/ActionLink'
import PasswordInput from '@/components/shared/PasswordInput'
import { FormItem, Form } from '@/components/ui/Form'
import { useAuth } from '@/auth'
import { APP_NAME } from '@/constants/app.constant'

const AdminLogin = () => {
    const [message, setMessage] = useState('')
    const [isSubmitting, setSubmitting] = useState(false)
    const { adminSignIn } = useAuth()

    const {
        handleSubmit,
        formState: { errors },
        control,
    } = useForm({
        defaultValues: { username: '', password: '' },
    })

    const onSubmit = async (values) => {
        setMessage('')
        setSubmitting(true)
        const result = await adminSignIn(values)
        if (result?.status === 'failed') {
            setMessage(result.message)
        }
        setSubmitting(false)
    }

    return (
        <div className="flex h-full items-center justify-center overflow-y-auto bg-gradient-to-br from-emerald-50 via-white to-emerald-100 px-4 py-10">
            <div className="w-full max-w-[380px]">
                <div className="mb-6 flex flex-col items-center text-center">
                    <Logo
                        type="streamline"
                        mode="light"
                        imgClass="mx-auto"
                        logoWidth={48}
                    />
                    <h1 className="mt-3 text-xl font-bold text-gray-900">
                        {APP_NAME} Admin
                    </h1>
                    <p className="mt-1 text-sm font-medium text-gray-500">
                        Restricted access
                    </p>
                </div>
                <div className="rounded-2xl bg-white p-8 shadow-xl shadow-emerald-900/10 ring-1 ring-emerald-900/5">
                    <div className="mb-6">
                        <h3 className="mb-1">Admin sign in</h3>
                        <p className="font-semibold heading-text">
                            Enter your admin credentials to continue
                        </p>
                    </div>
                    {message && (
                        <Alert showIcon className="mb-4" type="danger">
                            <span className="break-all">{message}</span>
                        </Alert>
                    )}
                    <Form onSubmit={handleSubmit(onSubmit)}>
                        <FormItem
                            label="Username"
                            invalid={Boolean(errors.username)}
                            errorMessage={errors.username?.message}
                        >
                            <Controller
                                name="username"
                                control={control}
                                rules={{ required: 'Username is required' }}
                                render={({ field }) => (
                                    <Input
                                        type="text"
                                        placeholder="admin"
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
                                rules={{ required: 'Password is required' }}
                                render={({ field }) => (
                                    <PasswordInput
                                        placeholder="Password"
                                        autoComplete="off"
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
                        >
                            {isSubmitting ? 'Signing in...' : 'Sign In'}
                        </Button>
                    </Form>
                    <div className="mt-6 text-center">
                        <span>Not an admin? </span>
                        <ActionLink
                            to="/sign-in"
                            className="heading-text font-bold"
                            themeColor={false}
                        >
                            Rider / Driver sign in
                        </ActionLink>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default AdminLogin
