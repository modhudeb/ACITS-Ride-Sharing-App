import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { HiOutlineEyeOff, HiOutlineEye } from 'react-icons/hi'

const PasswordInput = (props) => {
    const { onVisibleChange, ref, ...rest } = props

    const [pwInputType, setPwInputType] = useState('password')

    const onPasswordVisibleClick = (e) => {
        e.preventDefault()
        const nextValue = pwInputType === 'password' ? 'text' : 'password'
        setPwInputType(nextValue)
        onVisibleChange?.(nextValue === 'text')
    }

    return (
        <Input
            {...rest}
            ref={ref}
            type={pwInputType}
            suffix={
                <span
                    className="cursor-pointer select-none text-xl"
                    role="button"
                    onClick={onPasswordVisibleClick}
                >
                    {pwInputType === 'password' ? (
                        <HiOutlineEyeOff />
                    ) : (
                        <HiOutlineEye />
                    )}
                </span>
            }
        />
    )
}

export default PasswordInput
