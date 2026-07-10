import { TbList } from 'react-icons/tb'
import ToolButton from './ToolButton'

const ToolButtonBulletList = ({ editor }) => {
    return (
        <ToolButton
            title="Bullet List"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
            <TbList />
        </ToolButton>
    )
}

export default ToolButtonBulletList
