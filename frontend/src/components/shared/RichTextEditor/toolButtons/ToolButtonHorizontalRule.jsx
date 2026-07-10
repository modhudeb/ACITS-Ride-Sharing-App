import { TbMinus } from 'react-icons/tb'
import ToolButton from './ToolButton'

const ToolButtonHorizontalRule = ({ editor }) => {
    return (
        <ToolButton
            title="Horizontal Rule"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
            <TbMinus />
        </ToolButton>
    )
}

export default ToolButtonHorizontalRule
