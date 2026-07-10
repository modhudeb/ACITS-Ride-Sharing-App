import { TbSpacingVertical } from 'react-icons/tb'
import ToolButton from './ToolButton'

const ToolButtonHardBreak = ({ editor }) => {
    return (
        <ToolButton
            title="Horizontal Rule"
            onClick={() => editor.chain().focus().setHardBreak().run()}
        >
            <TbSpacingVertical />
        </ToolButton>
    )
}

export default ToolButtonHardBreak
