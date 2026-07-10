import { TbQuote } from 'react-icons/tb'
import ToolButton from './ToolButton'

const ToolButtonBlockquote = ({ editor }) => {
    return (
        <ToolButton
            title="Blockquote"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
            <TbQuote />
        </ToolButton>
    )
}

export default ToolButtonBlockquote
