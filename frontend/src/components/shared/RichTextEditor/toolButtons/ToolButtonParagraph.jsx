import { BiParagraph } from 'react-icons/bi'
import ToolButton from './ToolButton'

const ToolButtonParagraph = ({ editor }) => {
    return (
        <ToolButton
            title="Paragraph"
            active={editor.isActive('paragraph')}
            onClick={() => editor.chain().focus().setParagraph().run()}
        >
            <BiParagraph />
        </ToolButton>
    )
}

export default ToolButtonParagraph
