import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { VideoQuality } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
@Injectable()
export class AdminProfileService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}
  async getAllMovies(req: any) {
    const token = req.cookies?.token;
    const { user_id } = await this.jwt.verifyAsync(token);

    const user = await this.prisma.user.findUnique({ where: { id: user_id } });
    if (!user) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    if (user.role !== 'admin' && user.role !== 'superadmin')
      throw new ForbiddenException('Faqat adminlar uchun ruxsat');
    const movies = await this.prisma.movie.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        releaseYear: true,
        subscriptionType: true,
        viewCount: true,
        createdAt: true,
        createdBy: true,
        _count: {
          select: { reviews: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const formatted = movies.map((movie) => ({
      id: movie.id,
      title: movie.title,
      slug: movie.slug,
      release_year: movie.releaseYear,
      subscription_type: movie.subscriptionType,
      view_count: movie.viewCount,
      review_count: movie._count.reviews,
      created_at: movie.createdAt,
      created_by: movie.createdBy,
    }));

    const total = await this.prisma.movie.count();

    return {
      success: true,
      data: {
        movies: formatted,
        total,
      },
    };
  }
  async createMovie(dto: any, file: any, req: any) {
    const posterFilename = file.filename;

    const token = req.cookies?.token;
    const { user_id } = await this.jwt.verifyAsync(token);

    const user = await this.prisma.user.findUnique({ where: { id: user_id } });
    if (!user) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    if (user.role !== 'admin' && user.role !== 'superadmin')
      throw new ForbiddenException('Faqat adminlar uchun ruxsat');

    const movie = await this.prisma.movie.create({
      data: {
        title: dto.title,
        description: dto.description,
        releaseYear: Number(dto.release_year),
        durationMinutes: Number(dto.duration_minutes),
        subscriptionType: dto.subscription_type.trim(),
        posterUrl: `/uploads/${posterFilename}`,
        createdBy: user.id,
        rating: 0,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      message: 'Yangi kino muvaffaqiyatli qoshildi',
      data: movie,
    };
  }
  async updateMovie(movieId: string, dto: any, req: any) {
    const token = req.cookies?.token;
    const { user_id } = await this.jwt.verifyAsync(token);

    const user = await this.prisma.user.findUnique({ where: { id: user_id } });
    if (!user) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    if (user.role !== 'admin' && user.role !== 'superadmin')
      throw new ForbiddenException('Faqat adminlar uchun ruxsat');

    const updatedMovie = await this.prisma.movie.update({
      where: { id: movieId },
      data: dto,
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      message: 'Kino muvaffaqiyatli yangilandi',
      data: updatedMovie,
    };
  }
  async deleteMovie(movieId: string, req: any) {
    const token = req.cookies?.token;
    const { user_id } = await this.jwt.verifyAsync(token);

    const user = await this.prisma.user.findUnique({ where: { id: user_id } });
    if (!user) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    if (user.role !== 'admin' && user.role !== 'superadmin')
      throw new ForbiddenException('Faqat adminlar uchun ruxsat');

    await this.prisma.movie.delete({ where: { id: movieId } });

    return {
      success: true,
      message: 'Kino muvaffaqiyatli ochirildi',
    };
  }
  async uploadMovieFile(
    movieId: string,
    file: Express.Multer.File,
    body: { quality: string; language: string },
    req: any,
  ) {
    const qualityMap: Record<string, VideoQuality> = {
      '240p': 'P240',
      '360p': 'P360',
      '480p': 'P480',
      '720p': 'P720',
      '1080p': 'P1080',
      '4k': 'P4K',
    };

    const inputQuality = body.quality.toLowerCase();
    const mappedQuality = qualityMap[inputQuality];

    if (!mappedQuality) {
      throw new BadRequestException('Notogri video sifat turi');
    }

    const quality = mappedQuality as VideoQuality;

    if (!file) throw new BadRequestException('Fayl yuklanmadi');
    const token = req.cookies?.token;
    const { user_id } = await this.jwt.verifyAsync(token);

    const user = await this.prisma.user.findUnique({ where: { id: user_id } });
    if (!user) throw new UnauthorizedException('Foydalanuvchi aniqlanmadi');
    if (user.role !== 'admin' && user.role !== 'superadmin')
      throw new ForbiddenException('Faqat adminlar uchun ruxsat');
    const movie = await this.prisma.movie.findUnique({
      where: { id: movieId },
    });
    if (!movie) throw new NotFoundException('Kino topilmadi');
    const fileSizeMb = Math.round(file.size / (1024 * 1024));

    const movieFile = await this.prisma.movieFile.create({
      data: {
        movieId: movie.id,
        quality: quality,
        language: body.language,
        fileUrl: `/uploads/${file.filename}`,
      },
      select: {
        id: true,
        movieId: true,
        quality: true,
        language: true,
        fileUrl: true,
      },
    });

    return {
      success: true,
      message: 'Kino fayli muvaffaqiyatli yuklandi',
      data: movieFile,
    };
  }
  async promoteToAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    if (user.role === 'admin') {
      return {
        success: false,
        message: 'Foydalanuvchi allaqachon admin',
      };
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { role: 'admin' },
    });

    return {
      success: true,
      message: 'Foydalanuvchi admin qilindi',
      data: updatedUser,
    };
  }
}
