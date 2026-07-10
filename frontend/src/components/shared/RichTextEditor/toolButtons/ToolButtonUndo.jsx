import { CgUndo } from 'react-icons/cg'
import ToolButton from './ToolButton'

const ToolButtonUndo = ({ editor }) => {
    return (
        <ToolButton
            title="Code"
            disabled={!editor.can().chain().focus().undo().run()}
            onClick={() => editor.chain().focus().undo().run()}
        >
            <CgUndo />
        </ToolButton>
    )
}

export default ToolButtonUndo
