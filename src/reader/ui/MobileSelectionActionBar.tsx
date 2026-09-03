import { Highlighter, MessageSquarePlus, Trash2, X } from "lucide-react";

type MobileSelectionActionBarProps = {
  hasExistingAnnotation: boolean;
  onHighlight: () => void;
  onReflect: () => void;
  onDelete: () => void;
  onDismiss: () => void;
};

export function MobileSelectionActionBar({ hasExistingAnnotation, onHighlight, onReflect, onDelete, onDismiss }: MobileSelectionActionBarProps) {
  return <div className="mobile-selection-action-bar" role="toolbar" aria-label="文字选区操作">
    {hasExistingAnnotation
      ? <><button onClick={onReflect}><MessageSquarePlus size={16} />编辑感悟</button><button className="mobile-selection-delete" onClick={onDelete}><Trash2 size={16} />删除</button></>
      : <><button onClick={onHighlight}><Highlighter size={16} />高亮</button><button onClick={onReflect}><MessageSquarePlus size={16} />写感悟</button></>}
    <button className="mobile-selection-dismiss" aria-label="关闭文字选区操作" onClick={onDismiss}><X size={15} /></button>
  </div>;
}
