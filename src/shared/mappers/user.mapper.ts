import type { UserDTO, UserMinDTO } from '@duckflix/shared';
import type { User } from '@schema/user.schema';

export const toUserMinDTO = (user: Pick<User, 'id' | 'name' | 'role' | 'system'>): UserMinDTO => ({
    id: user.id,
    role: user.role,
    name: user.name,
    system: user.system,
});

export const toUserDTO = (user: User): UserDTO => ({
    ...toUserMinDTO(user),
    email: user.email,
    isVerified: user.verified_email,
    createdAt: user.createdAt,
});
