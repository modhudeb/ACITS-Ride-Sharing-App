import { TbCode } from 'react-icons/tb'
import ToolButton from './ToolButton'

const ToolButtonCode = ({ editor }) => {
    return (
        <ToolButton
            title="Code"
            disabled={!editor.can().chain().focus().toggleCode().run()}
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
        >
            <TbCode />
        </ToolButton>
    )
}

export default ToolButtonCode
