import multer from 'multer';
import { AppError } from '../../shared/errors';
import type { Multer } from 'multer';

const UPLOADS_FOLDER = process.env.UPLOADS_FOLDER ?? 'uploads';
const FILE_LIMIT_MB = process.env.UPLOAD_FILE_LIMIT ? Number(process.env.UPLOAD_FILE_LIMIT) : 16384; // 16GB limit per upload by default

export const movieUpload: Multer = multer({
    dest: UPLOADS_FOLDER + '/temp/',
    limits: {
        fileSize: 1024 * 1024 * FILE_LIMIT_MB,
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/') || file.mimetype === 'application/octet-stream') cb(null, true);
        else cb(new AppError('Only video files (mp4, mkv, avi, mov) are allowed', 400) as unknown as null, false);
    },
});
