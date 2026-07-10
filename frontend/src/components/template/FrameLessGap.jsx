import classNames from '@/utils/classNames'

const FrameLessGap = ({ children, className }) => {
    return <div className={classNames(className, 'p-6')}>{children}</div>
}

export default FrameLessGap
