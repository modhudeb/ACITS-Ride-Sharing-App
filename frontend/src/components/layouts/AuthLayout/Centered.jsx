import { cloneElement } from 'react'
import Logo from '@/components/template/Logo'
import { APP_NAME, APP_TAGLINE } from '@/constants/app.constant'

const Centered = ({ children, ...rest }) => {
    return (
        <div className="flex min-h-full w-full justify-center overflow-y-auto bg-gradient-to-br from-emerald-50 via-white to-emerald-100 px-4 py-10">
            <div className="my-auto w-full max-w-[420px]">
                <div className="mb-6 flex flex-col items-center text-center">
                    <Logo
                        type="streamline"
                        mode="light"
                        imgClass="mx-auto"
                        logoWidth={56}
                    />
                    <h1 className="mt-3 text-2xl font-bold text-gray-900">
                        {APP_NAME}
                    </h1>
                    <p className="mt-1 text-sm font-medium text-gray-500">
                        {APP_TAGLINE}
                    </p>
                </div>
                <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-xl shadow-emerald-900/10 ring-1 ring-emerald-900/5">
                    {children
                        ? cloneElement(children, {
                              ...rest,
                          })
                        : null}
                </div>
            </div>
        </div>
    )
}

export default Centered
