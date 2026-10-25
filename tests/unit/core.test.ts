import { describe, it, expect } from 'vitest';
import { Pagination } from '../../src/core/http/pagination';
import { containsPattern } from '../../src/core/database/like-pattern';

describe('Pagination.fromQuery', () => {
    const opts = { defaultLimit: 10, maxLimit: 50 };

    it.each([
        [{},                              1, 10],
        [{ page: '3', limit: '20' },      3, 20],
        [{ page: '0', limit: '0' },       1, 1],
        [{ page: '-2', limit: '999' },    1, 50],
        [{ page: 'abc', limit: 'x' },     1, 10],
        [{ page: '', limit: '' },         1, 10],
        [{ page: '2.7', limit: '5.9' },   2, 5],
    ])('%j → page %i, limit %i', (query, page, limit) => {
        const p = Pagination.fromQuery(query, opts);
        expect([p.page, p.limit]).toEqual([page, limit]);
    });

    it('offset e totalPages', () => {
        const p = Pagination.fromQuery({ page: '3', limit: '10' }, opts);
        expect(p.offset).toBe(20);
        expect(p.toPage([], 21).totalPages).toBe(3);
        expect(p.toPage([], 0).totalPages).toBe(0);
    });
});

describe('containsPattern', () => {
    it('escapa curingas do LIKE', () => {
        expect(containsPattern('abc')).toBe('%abc%');
        expect(containsPattern('50%')).toBe('%50\\%%');
        expect(containsPattern('a_b')).toBe('%a\\_b%');
        expect(containsPattern('c:\\x')).toBe('%c:\\\\x%');
    });
});
