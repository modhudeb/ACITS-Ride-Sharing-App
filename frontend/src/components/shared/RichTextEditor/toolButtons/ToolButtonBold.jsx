import { TbBold } from 'react-icons/tb'
import ToolButton from './ToolButton'

const ToolButtonBold = ({ editor, ...rest }) => {
    return (
        <ToolButton
            title="Bold"
            disabled={!editor.can().chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            {...rest}
        >
            <TbBold />
        </ToolButton>
    )
}

export default ToolButtonBold
