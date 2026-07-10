import { CgRedo } from 'react-icons/cg'
import ToolButton from './ToolButton'

const ToolButtonRedo = ({ editor }) => {
    return (
        <ToolButton
            title="Code"
            disabled={!editor.can().chain().focus().redo().run()}
            onClick={() => editor.chain().focus().redo().run()}
        >
            <CgRedo />
        </ToolButton>
    )
}

export default ToolButtonRedo
