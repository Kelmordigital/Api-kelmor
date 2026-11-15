function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Prefixa `*Nome:*` na mensagem enviada por um atendente (config "Ocultar nome do
 * atendente no chat"). Não duplica o prefixo se o texto já começar com ele.
 */
export function withAttendantNamePrefix(body: string, name: string): string {
    const already = new RegExp(`^\\*${escapeRegExp(name)}:\\*`, 'i').test(body.trim());
    if (already) return body;
    return `*${name}:*\n${body}`;
}
