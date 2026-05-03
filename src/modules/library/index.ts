import { Elysia } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import * as LibraryService from './library.service';
import {
    getUserLibrariesScheme,
    libraryScheme,
    newLibraryScheme,
    libraryQuerySchema,
    libraryItemScheme,
    libraryItemTypeScheme,
} from './library.validator';
import { createRateLimit } from '@shared/configs/ratelimit';

const libraryLimiter = createRateLimit({
    max: 45,
    duration: 3000,
});

export const libraryRouter = new Elysia({ prefix: '/libraries' })
    .use(authGuard)
    .use(libraryLimiter)
    .guard({ auth: true })
    .get(
        '/',
        async ({ user, query }) => {
            const libraries = await LibraryService.getUserLibraries(user.profileId!, query);

            return { status: 'success', data: { libraries } };
        },
        {
            query: getUserLibrariesScheme,
            detail: { tags: ['Library'], summary: 'List Libraries' },
        }
    )
    .post(
        '/',
        async ({ user, body }) => {
            const library = await LibraryService.createUserLibrary(user.profileId!, { accountId: user.id, ...body });

            return { status: 'success', data: { library } };
        },
        {
            body: newLibraryScheme,
            detail: { tags: ['Library'], summary: 'Create' },
        }
    )
    .get(
        '/:libraryId',
        async ({ user, params: { libraryId } }) => {
            const library = await LibraryService.getUserLibrary(user.profileId!, libraryId);
            return { status: 'success', data: { library } };
        },
        {
            params: libraryScheme,
            detail: { tags: ['Library'], summary: 'Details' },
        }
    )
    .delete(
        '/:libraryId',
        async ({ user, params: { libraryId }, set }) => {
            await LibraryService.deleteUserLibrary(user.profileId!, libraryId, { accountId: user.id });
            set.status = 204;
        },
        {
            params: libraryScheme,
            detail: { tags: ['Library'], summary: 'Remove' },
        }
    )
    .get(
        '/:libraryId/items',
        async ({ user, params: { libraryId }, query }) => {
            const paginatedResults = await LibraryService.getUserLibraryItems(user.profileId!, libraryId, query);

            return { status: 'success', ...paginatedResults };
        },
        {
            params: libraryScheme,
            query: libraryQuerySchema,
            detail: { tags: ['Library'], summary: 'List Items' },
        }
    )
    .post(
        '/:libraryId/items/:contentId',
        async ({ user, params: { libraryId, contentId }, query, set }) => {
            await LibraryService.addContentToUserLibrary(user.profileId!, libraryId, contentId, query.type);

            set.status = 204;
        },
        {
            params: libraryItemScheme,
            query: libraryItemTypeScheme,
            detail: { tags: ['Library'], summary: 'Add Item' },
        }
    )
    .delete(
        '/:libraryId/items/:contentId',
        async ({ user, params: { libraryId, contentId }, query, set }) => {
            await LibraryService.removeContentFromUserLibrary(user.profileId!, libraryId, contentId, query.type);

            set.status = 204;
        },
        {
            params: libraryItemScheme,
            query: libraryItemTypeScheme,
            detail: { tags: ['Library'], summary: 'Remove Item' },
        }
    );
