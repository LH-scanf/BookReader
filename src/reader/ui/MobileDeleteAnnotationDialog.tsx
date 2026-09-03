type MobileDeleteAnnotationDialogProps = {
  onCancel: () => void;
  onConfirm: () => void;
};

export function MobileDeleteAnnotationDialog({ onCancel, onConfirm }: MobileDeleteAnnotationDialogProps) {
  return <div className="mobile-delete-annotation-layer" role="presentation">
    <button className="mobile-delete-annotation-backdrop" aria-label="取消删除" onClick={onCancel} />
    <section className="mobile-delete-annotation-dialog" role="alertdialog" aria-modal="true" aria-label="删除这条高亮">
      <strong>删除这条高亮？</strong>
      <p>删除后，高亮和感悟都会移除。</p>
      <div><button onClick={onCancel}>取消</button><button className="mobile-delete-annotation-confirm" onClick={onConfirm}>删除</button></div>
    </section>
  </div>;
}
