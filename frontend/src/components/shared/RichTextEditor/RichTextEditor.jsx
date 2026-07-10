import classNames from '@/utils/classNames'
import ToolButtonBold from './toolButtons/ToolButtonBold'
import ToolButtonItalic from './toolButtons/ToolButtonItalic'
import ToolButtonStrike from './toolButtons/ToolButtonStrike'
import ToolButtonCode from './toolButtons/ToolButtonCode'
import ToolButtonOrderedList from './toolButtons/ToolButtonOrderedList'
import ToolButtonCodeBlock from './toolButtons/ToolButtonCodeBlock'
import ToolButtonBlockquote from './toolButtons/ToolButtonBlockquote'
import ToolButtonHorizontalRule from './toolButtons/ToolButtonHorizontalRule'
import ToolButtonHeading from './toolButtons/ToolButtonHeading'
import ToolButtonParagraph from './toolButtons/ToolButtonParagraph'
import ToolButtonUndo from './toolButtons/ToolButtonUndo'
import ToolButtonRedo from './toolButtons/ToolButtonRedo'
import ToolButtonBulletList from './toolButtons/ToolButtonBulletList'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

const RichTextEditor = (props) => {
    const {
        content = '',
        customToolBar,
        invalid,
        onChange,
        editorContentClass,
        customEditor,
        ref,
        ...rest
    } = props

    const editor = customEditor
        ? customEditor
        : useEditor({
              extensions: [
                  StarterKit.configure({
                      bulletList: {
                          keepMarks: true,
                      },
                      orderedList: {
                          keepMarks: true,
                      },
                  }),
              ],
              editorProps: {
                  attributes: {
                      class: 'm-2 focus:outline-hidden',
                  },
              },
              content,
              onUpdate({ editor }) {
                  onChange?.({
                      text: editor.getText(),
                      html: editor.getHTML(),
                      json: editor.getJSON(),
                  })
              },
          })

    if (!editor) return null

    return (
        <div
            className={classNames(
                'rich-text-editor rounded-xl ring-1 ring-gray-200 dark:ring-gray-600 border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 pt-3',
                editor.isFocused && 'ring-primary border-primary',
                invalid && 'bg-error-subtle',
                editor.isFocused &&
                    invalid &&
                    'bg-error-subtle ring-error border-error',
            )}
        >
            <div className="flex gap-x-1 gap-y-2 px-2">
                {customToolBar ? (
                    customToolBar(editor, {
                        ToolButtonBold,
                        ToolButtonItalic,
                        ToolButtonStrike,
                        ToolButtonCode,
                        ToolButtonBlockquote,
                        ToolButtonHeading,
                        ToolButtonBulletList,
                        ToolButtonOrderedList,
                        ToolButtonCodeBlock,
                        ToolButtonHorizontalRule,
                        ToolButtonParagraph,
                        ToolButtonUndo,
                        ToolButtonRedo,
                    })
                ) : (
                    <>
                        <ToolButtonBold editor={editor} />
                        <ToolButtonItalic editor={editor} />
                        <ToolButtonStrike editor={editor} />
                        <ToolButtonCode editor={editor} />
                        <ToolButtonBlockquote editor={editor} />
                        <ToolButtonHeading editor={editor} />
                        <ToolButtonBulletList editor={editor} />
                        <ToolButtonOrderedList editor={editor} />
                        <ToolButtonCodeBlock editor={editor} />
                        <ToolButtonHorizontalRule editor={editor} />
                    </>
                )}
            </div>

            <EditorContent
                ref={ref}
                className={classNames(
                    'max-h-[600px] overflow-auto px-2 prose prose-p:text-sm dark:prose-p:text-gray-400 max-w-full',
                    editorContentClass,
                )}
                editor={editor}
                {...rest}
            />
        </div>
    )
}

export default RichTextEditor
