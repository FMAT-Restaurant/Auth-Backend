import { Entity, Column, PrimaryColumn } from 'typeorm';

export enum RoleEnum {
  ADMINISTRADOR = 'ADMINISTRADOR',
  HOST = 'HOST',
  ALMACENISTA = 'ALMACENISTA',
  GESTOR_MENU = 'GESTOR_MENU',
  MESERO = 'MESERO',
  CHEF_MASTER = 'CHEF_MASTER',
  CAJERO = 'CAJERO',
}

@Entity('roles')
export class Role {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  code: RoleEnum | string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'boolean', default: true })
  isAssignable: boolean;

  @Column('simple-array', { nullable: true })
  permissions: string[];

  @Column({ type: 'boolean', default: false })
  isSystemRole: boolean;
}
