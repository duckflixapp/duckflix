export const isDuplicateKey = (e: unknown) => {
    return e instanceof Error && e.message.includes('UNIQUE constraint failed');
};
