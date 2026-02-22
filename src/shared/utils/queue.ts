interface QueueElement<T> {
    element: T;
    prev: QueueElement<T> | null;
    next: QueueElement<T> | null;
}

const createNode = <T>(element: T, prev: QueueElement<T> | null, next: QueueElement<T> | null): QueueElement<T> => {
    return {
        element: element,
        prev: prev,
        next: next,
    };
};

export class Queue<T> {
    private head: QueueElement<T> | null = null;
    private tail: QueueElement<T> | null = null;
    private queueSize: number = 0;
    constructor(elements?: T[]) {
        if (!elements) return;
        for (let i = 0; i < elements.length; i++) this.add(elements[i] as T);
    }

    /**
     * Returns the total number of elements currently in the queue.
     */
    public get size(): number {
        return this.queueSize;
    }

    /**
     * Checks whether the queue has no elements.
     * @returns True if empty, false otherwise.
     */
    public get isEmpty(): boolean {
        return this.size <= 0;
    }

    /**
     * Appends a new element to the end of the queue.
     * @param element - The data to be added.
     * @returns The new size of the queue.
     */
    public add(element: T): number {
        const node = createNode(element, this.tail, null);
        if (this.head == null) {
            this.head = node;
        }
        if (this.tail) this.tail.next = node;
        this.tail = node;
        return ++this.queueSize;
    }

    /**
     * Removes and returns the element at the front of the queue.
     * @returns The element at the head, or undefined if the queue is empty.
     */
    public remove(): T | undefined {
        if (!this.head) return undefined;
        const element = this.head.element;
        this.head = this.head.next;
        if (this.head == null) this.tail = null;
        else this.head.prev = null;
        this.queueSize--;
        return element;
    }

    /**
     * Removes and returns the first element that matches the predicate.
     * @param predicate - A function to test each element.
     * @returns The removed element, or undefined if no match is found.
     */
    public removeWhere(predicate: (value: T) => boolean): T | undefined {
        let curr = this.head;

        while (curr !== null) {
            if (predicate(curr.element)) {
                const { prev, next, element } = curr;

                if (prev === null) {
                    this.head = next;
                } else {
                    prev.next = next;
                }

                if (next === null) {
                    this.tail = prev;
                } else {
                    next.prev = prev;
                }

                this.queueSize--;
                return element;
            }
            curr = curr.next;
        }

        return undefined;
    }
    /**
     * Retrieves, but does not remove, the element at the front of the queue.
     * @returns The head element, or undefined if the queue is empty.
     */
    public peek(): T | undefined {
        if (!this.head) return undefined;
        return this.head.element;
    }

    /**
     * Searches for an element's index based on a provided testing function.
     * @param predicate - A function to test each element.
     * @returns The zero-based index of the first matching element, or -1 if not found.
     */
    public findPosition(predicate: (value: T) => boolean): number {
        let position = 0;
        let curr = this.head;
        while (curr != null) {
            if (predicate(curr.element)) return position;

            curr = curr.next;
            position++;
        }
        return -1;
    }

    /**
     * Removes all elements from the queue and resets its size.
     */
    public clear(): void {
        this.head = null;
        this.tail = null;
        this.queueSize = 0;
    }

    /**
     * Returns an iterator that allows traversing the elements in the queue from head to tail.
     */
    *[Symbol.iterator](): IterableIterator<T> {
        let curr = this.head;
        while (curr != null) {
            yield curr.element;
            curr = curr.next;
        }
    }
}
