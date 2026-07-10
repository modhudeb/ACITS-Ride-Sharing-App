import { useThemeStore } from '@/store/themeStore'
import { THEME_ENUM } from '@/constants/theme.constant'

const { MODE_DARK } = THEME_ENUM

const DoubleSidedImage = ({ src, darkModeSrc, alt = '', ...rest }) => {
    const mode = useThemeStore((state) => state.mode)

    return (
        <img src={mode === MODE_DARK ? darkModeSrc : src} alt={alt} {...rest} />
    )
}

export default DoubleSidedImage
