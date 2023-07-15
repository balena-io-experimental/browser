import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeUrlDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  url: string;
}
