import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronRight, FiChevronDown, FiEdit2, FiTrash2, FiPlus } from 'react-icons/fi';
import type { Departamento } from '@spiraview/shared';
import styles from './DepartamentoTree.module.css';

interface DepartamentoTreeProps {
    nodes: Departamento[];
    selectedId?: string | null;
    canEdit: boolean;
    onSelect: (dep: Departamento) => void;
    onEdit: (dep: Departamento) => void;
    onDelete: (dep: Departamento) => void;
    onAddChild: (pai: Departamento) => void;
}

interface NodeProps extends Omit<DepartamentoTreeProps, 'nodes'> {
    node: Departamento;
    depth: number;
}

function DepartamentoNode({ node, depth, selectedId, canEdit, onSelect, onEdit, onDelete, onAddChild }: NodeProps) {
    const { t } = useTranslation();
    const hasChildren = (node.subdepartamentos?.length ?? 0) > 0;
    const [expanded, setExpanded] = useState(depth < 2);

    return (
        <div className={styles.node}>
            <div
                className={`${styles.nodeRow} ${selectedId === node.id ? styles.nodeRowSelected : ''}`}
                onClick={() => onSelect(node)}
            >
                {/* Botão expandir */}
                {hasChildren ? (
                    <button
                        className={styles.expandBtn}
                        onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
                        title={expanded ? t('recolher', 'Recolher') : t('expandir', 'Expandir')}
                    >
                        {expanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                    </button>
                ) : (
                    <span className={styles.expandPlaceholder} />
                )}

                <span className={styles.nodeName} title={node.nome}>{node.nome}</span>

                {typeof node.colaboradores_count === 'number' && (
                    <span className={styles.nodeCount}>{node.colaboradores_count}</span>
                )}

                {canEdit && (
                    <span className={styles.nodeActions} onClick={e => e.stopPropagation()}>
                        <button
                            className={styles.iconBtn}
                            title={t('depAdicionarFilho', 'Adicionar subdepartamento')}
                            onClick={() => onAddChild(node)}
                        >
                            <FiPlus size={13} />
                        </button>
                        <button
                            className={styles.iconBtn}
                            title={t('editarDepartamento', 'Editar departamento')}
                            onClick={() => onEdit(node)}
                        >
                            <FiEdit2 size={13} />
                        </button>
                        <button
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                            title={t('excluirDepartamento', 'Excluir departamento')}
                            onClick={() => onDelete(node)}
                        >
                            <FiTrash2 size={13} />
                        </button>
                    </span>
                )}
            </div>

            {hasChildren && expanded && (
                <div className={styles.children}>
                    {node.subdepartamentos!.map(child => (
                        <DepartamentoNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            selectedId={selectedId}
                            canEdit={canEdit}
                            onSelect={onSelect}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onAddChild={onAddChild}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function DepartamentoTree({ nodes, selectedId, canEdit, onSelect, onEdit, onDelete, onAddChild }: DepartamentoTreeProps) {
    return (
        <div>
            {nodes.map(node => (
                <DepartamentoNode
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedId={selectedId}
                    canEdit={canEdit}
                    onSelect={onSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onAddChild={onAddChild}
                />
            ))}
        </div>
    );
}
