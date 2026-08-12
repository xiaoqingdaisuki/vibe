export interface MonsterStats {
  level: number | null;
  experience: number | null;
  meso: number | null;
  hp: number | null;
  mp: number | null;
  weaponAttack: number | null;
  magicAttack: number | null;
  weaponDefense: number | null;
  magicDefense: number | null;
  accuracy: number | null;
  avoidability: number | null;
  hpRecoveryPer10Seconds: number | null;
  mpRecoveryPer10Seconds: number | null;
  speed: number | null;
  knockback: number | null;
}

export interface MonsterDrop {
  id: string;
  name: string;
  category: string;
}

export interface MonsterTraits {
  weaknesses: string[];
  resistances: string[];
}

export interface MapleMonster {
  id: string;
  name: string;
  imageUrl: string | null;
  sourceUrl: string;
  stats: MonsterStats;
  drops: MonsterDrop[];
  traits: MonsterTraits;
}

export interface MonsterDatabase {
  schemaVersion: number;
  source: {
    name: string;
    url: string;
    version: string;
    pages: number;
    updatedAt: string;
  };
  monsters: MapleMonster[];
}
