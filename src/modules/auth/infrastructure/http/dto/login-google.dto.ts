import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginGoogleDto {
  // ID token (JWT OIDC) emitido pelo Google Identity Services no front.
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  idToken: string;
}
