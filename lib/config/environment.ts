/**
 * Configuración base de ambientes para yapepay-infra.
 *
 * Mantiene tipos e interfaces compartidas. Cada archivo `dev.ts`, `staging.ts`
 * y `prod.ts` exporta una constante concreta que cumple `EnvironmentConfig`.
 *
 * No crea recursos AWS por sí solo. Solo describe la configuración que será
 * consumida por el entrypoint y los stacks cuando se implementen.
 */

export type EnvName = 'dev' | 'staging' | 'prod';

export interface FeatureFlags {
  /**
   * Habilita recursos potencialmente costosos (NAT Gateway, RDS Multi-AZ,
   * ElastiCache, etc.). Debe permanecer `false` en `dev` durante la fase MVP.
   */
  enableCostlyResources: boolean;

  /**
   * Habilita endurecimiento adicional (WAF, GuardDuty, Config Rules, etc.).
   */
  enableSecurityHardening: boolean;

  /**
   * Habilita el `EdgeStack` (CloudFront + WAF) que debe desplegarse en
   * `us-east-1` aun cuando el resto de la plataforma viva en otra región.
   */
  enableEdgeStack: boolean;
}

export interface EnvironmentConfig {
  readonly projectName: string;
  readonly envName: EnvName;
  readonly region: string;
  /** Cuenta AWS opcional. Si no se define se toma de `CDK_DEFAULT_ACCOUNT`. */
  readonly account?: string;
  /**
   * Permite destruir recursos efímeros del ambiente al ejecutar `cdk destroy`.
   * Debe permanecer `false` en ambientes no efímeros.
   */
  readonly removalPolicyDestroy: boolean;
  readonly features: FeatureFlags;
  /** Tags globales que se aplican a todos los stacks. */
  readonly tags: Record<string, string>;
}

export const DEFAULT_REGION = 'us-east-1';
export const PROJECT_NAME = 'yapepay';
