// apps/web/src/shared/components/ErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    /** Conteúdo exibido em caso de erro. Se omitido, usa o fallback padrão. */
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Captura erros de renderização em qualquer filho da árvore.
 * Evita que um erro pontual derrube toda a aplicação com tela branca.
 *
 * Uso:
 *   <ErrorBoundary>
 *     <MeuComponente />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    private handleReload = () => {
        window.location.reload();
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        if (this.props.fallback) return this.props.fallback;

        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '200px',
                padding: '2rem',
                gap: '1rem',
                textAlign: 'center',
            }}>
                <span style={{ fontSize: '2.5rem' }}>⚠️</span>
                <p style={{ margin: 0, fontWeight: 600 }}>
                    Algo deu errado ao carregar esta seção.
                </p>
                <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.7 }}>
                    {this.state.error?.message}
                </p>
                <button
                    onClick={this.handleReload}
                    style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem 1.25rem',
                        border: 'none',
                        borderRadius: '6px',
                        background: '#1976d2',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                    }}
                >
                    Recarregar página
                </button>
            </div>
        );
    }
}
