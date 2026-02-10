import type { UserDTO, UserMinDTO } from '@duckflix/shared';
import type { User } from '../schema';

export const toUserMinDTO = (user: Pick<User, 'id' | 'name'>): UserMinDTO => ({
    id: user.id,
    name: user.name,
});

export const toUserDTO = (user: User): UserDTO => ({
    ...toUserMinDTO(user),
    email: user.email,
    createdAt: user.createdAt.toISOString(),
});
