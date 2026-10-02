import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { StaffProfile } from './staff-profile.entity';
import { Role } from './role.entity';
import { RefreshToken } from './refresh-token.entity';

export enum UserType {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
}

export enum PasswordStatus {
  TEMPORARY = 'TEMPORARY',
  ACTIVE = 'ACTIVE',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, default: UserType.STAFF })
  userType: UserType;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20, default: PasswordStatus.ACTIVE })
  passwordStatus: PasswordStatus;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @OneToOne(() => StaffProfile, (profile) => profile.user, {
    cascade: true,
    eager: true,
  })
  staffProfile: StaffProfile;

  @ManyToMany(() => Role, { eager: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'userId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'roleCode', referencedColumnName: 'code' },
  })
  roles: Role[];

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens: RefreshToken[];
}
