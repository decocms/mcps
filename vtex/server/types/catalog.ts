// ============ PRODUCT TYPES ============

export interface Product {
  Id: number;
  Name: string;
  DepartmentId: number;
  CategoryId: number;
  BrandId: number;
  LinkId: string;
  RefId: string;
  IsVisible: boolean;
  Description: string;
  DescriptionShort: string;
  ReleaseDate: string;
  KeyWords: string;
  Title: string;
  IsActive: boolean;
  TaxCode: string;
  MetaTagDescription: string;
  ShowWithoutStock: boolean;
  Score: number | null;
}

export interface ProductIds {
  data: Record<string, number[]>;
  range: { total: number; from: number; to: number };
}

export interface CreateProductInput {
  Name: string;
  CategoryId: number;
  BrandId: number;
  LinkId: string;
  RefId?: string;
  IsVisible?: boolean;
  Description?: string;
  DescriptionShort?: string;
  ReleaseDate?: string;
  KeyWords?: string;
  Title?: string;
  IsActive?: boolean;
  TaxCode?: string;
  MetaTagDescription?: string;
  ShowWithoutStock?: boolean;
  Score?: number;
}

// ============ SKU TYPES ============

export interface Sku {
  Id: number;
  ProductId: number;
  IsActive: boolean;
  Name: string;
  RefId: string;
  PackagedHeight: number;
  PackagedLength: number;
  PackagedWidth: number;
  PackagedWeightKg: number;
  Height: number;
  Length: number;
  Width: number;
  WeightKg: number;
  CubicWeight: number;
  IsKit: boolean;
  CreationDate: string;
  MeasurementUnit: string;
  UnitMultiplier: number;
}

export interface CreateSkuInput {
  ProductId: number;
  Name: string;
  IsActive: boolean;
  RefId?: string;
  PackagedHeight?: number;
  PackagedLength?: number;
  PackagedWidth?: number;
  PackagedWeightKg?: number;
  Height?: number;
  Length?: number;
  Width?: number;
  WeightKg?: number;
  MeasurementUnit?: string;
  UnitMultiplier?: number;
}

// ============ CATEGORY TYPES ============

export interface Category {
  Id: number;
  Name: string;
  FatherCategoryId: number | null;
  Title: string;
  Description: string;
  Keywords: string;
  IsActive: boolean;
  ShowInStoreFront: boolean;
  ShowBrandFilter: boolean;
  ActiveStoreFrontLink: boolean;
  GlobalCategoryId: number;
  Score: number | null;
  LinkId: string;
  HasChildren: boolean;
}

export interface CategoryTree {
  id: number;
  name: string;
  hasChildren: boolean;
  url: string;
  children: CategoryTree[];
}

export interface CreateCategoryInput {
  Name: string;
  FatherCategoryId?: number | null;
  Title?: string;
  Description?: string;
  Keywords?: string;
  IsActive?: boolean;
  ShowInStoreFront?: boolean;
  ShowBrandFilter?: boolean;
  ActiveStoreFrontLink?: boolean;
  GlobalCategoryId?: number;
  Score?: number;
}

// ============ BRAND TYPES ============

export interface Brand {
  id: number;
  name: string;
  isActive: boolean;
  title: string | null;
  metaTagDescription: string | null;
  imageUrl: string | null;
}

export interface CreateBrandInput {
  Name: string;
  Text?: string;
  Keywords?: string;
  SiteTitle?: string;
  Active?: boolean;
  MenuHome?: boolean;
}
