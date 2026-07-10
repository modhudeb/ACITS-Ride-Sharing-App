import { TbListNumbers } from 'react-icons/tb'
import ToolButton from './ToolButton'

const ToolButtonOrderedList = ({ editor }) => {
    return (
        <ToolButton
            title="Ordered List"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
            <TbListNumbers />
        </ToolButton>
    )
}

export default ToolButtonOrderedList
