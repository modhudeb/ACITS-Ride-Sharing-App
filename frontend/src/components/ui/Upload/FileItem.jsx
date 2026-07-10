import { VscFilePdf, VscFileZip, VscFile } from 'react-icons/vsc'
import classNames from '../utils/classNames'

const BYTE = 1000
const getKB = (bytes) => Math.round(bytes / BYTE)

const FileIcon = ({ children }) => {
    return <span className="text-3xl heading-text">{children}</span>
}

const FileItem = (props) => {
    const { file, children, className } = props
    const { type, name, size } = file

    const renderThumbnail = () => {
        const isImageFile = type.split('/')[0] === 'image'

        if (isImageFile) {
            return (
                <img
                    className="upload-file-image"
                    src={URL.createObjectURL(file)}
                    alt={`file preview ${name}`}
                />
            )
        }

        if (type === 'application/zip') {
            return (
                <FileIcon>
                    <VscFileZip />
                </FileIcon>
            )
        }

        if (type === 'pdf') {
            return (
                <FileIcon>
                    <VscFilePdf />
                </FileIcon>
            )
        }

        return (
            <FileIcon>
                <VscFile />
            </FileIcon>
        )
    }

    return (
        <div className={classNames('upload-file', className)}>
            <div className="flex items-center">
                <div className="upload-file-thumbnail">{renderThumbnail()}</div>
                <div className="upload-file-info">
                    <h6 className="upload-file-name text-sm font-bold">
                        {name}
                    </h6>
                    <span className="upload-file-size">{getKB(size)} kb</span>
                </div>
            </div>
            {children}
        </div>
    )
}

FileItem.displayName = 'UploadFileItem'

export default FileItem
