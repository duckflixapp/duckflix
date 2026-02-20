import { describe, test, expect, beforeEach } from 'bun:test';
import { Queue } from '../queue';

describe('Queue Data Structure', () => {
    test('Should initialize empty queue', () => {
        const q = new Queue<number>();
        expect(q.size).toBe(0);
        expect(q.isEmpty).toBe(true);
    });

    test('Should initialize queue with 3 elements', () => {
        const q = new Queue<number>([1, 2, 3]);
        expect(q.size).toBe(3);
        expect(q.peek()).toBe(1);
    });

    test('add() should add to the end', () => {
        const q = new Queue<string>();
        q.add('A');
        q.add('B');
        expect(q.size).toBe(2);
        expect(q.peek()).toBe('A');
    });

    test('remove() should remove from start and retrieve value', () => {
        const q = new Queue<number>([10, 20]);
        expect(q.remove()).toBe(10);
        expect(q.remove()).toBe(20);
        expect(q.remove()).toBeUndefined();
        expect(q.size).toBe(0);
    });

    test('peek() should only retrieve value', () => {
        const q = new Queue<number>([5, 10]);
        expect(q.peek()).toBe(5);
        expect(q.size).toBe(2);
    });

    test('should handle empty and filling again', () => {
        const q = new Queue<number>();
        q.add(1);
        q.remove();
        expect(q.isEmpty).toBe(true);
        expect(q.peek()).toBeUndefined();

        q.add(2);
        expect(q.peek()).toBe(2);
        expect(q.size).toBe(1);
    });

    test('should handle prev/next refrences correctly', () => {
        const q = new Queue<number>([1, 2]);
        q.remove();
        q.add(3);
        expect(q.peek()).toBe(2);
        q.remove();
        expect(q.peek()).toBe(3);
    });
});

describe('Queue > findPosition', () => {
    let queue: Queue<{ id: string; val: number }>;

    beforeEach(() => {
        queue = new Queue();
    });

    test('should return 0 for the head element', () => {
        queue.add({ id: 'a', val: 1 });
        queue.add({ id: 'b', val: 2 });

        const pos = queue.findPosition((item) => item.id === 'a');
        expect(pos).toBe(0);
    });

    test('should return correct position for middle or tail element', () => {
        queue.add({ id: 'a', val: 1 });
        queue.add({ id: 'b', val: 2 });
        queue.add({ id: 'c', val: 3 });

        const posB = queue.findPosition((item) => item.id === 'b');
        const posC = queue.findPosition((item) => item.id === 'c');

        expect(posB).toBe(1);
        expect(posC).toBe(2);
    });

    test('should return -1 if element is not found', () => {
        queue.add({ id: 'a', val: 1 });

        const pos = queue.findPosition((item) => item.id === 'non-existent');
        expect(pos).toBe(-1);
    });

    test('should return -1 for an empty queue', () => {
        const pos = queue.findPosition((item) => item.val === 10);
        expect(pos).toBe(-1);
    });

    test('should work correctly after removing elements', () => {
        queue.add({ id: 'a', val: 1 });
        queue.add({ id: 'b', val: 2 });
        queue.add({ id: 'c', val: 3 });

        queue.remove();

        expect(queue.findPosition((item) => item.id === 'b')).toBe(0);
        expect(queue.findPosition((item) => item.id === 'c')).toBe(1);
    });
});
