import { TbCodeDots } from 'react-icons/tb'
import ToolButton from './ToolButton'

const ToolButtonCodeBlock = ({ editor }) => {
    return (
        <ToolButton
            title="Code Block"
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
            <TbCodeDots />
        </ToolButton>
    )
}

export default ToolButtonCodeBlock
