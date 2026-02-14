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

// ============ COLLECTION TYPES ============

export interface Collection {
  Id: number;
  Name: string;
  Description: string;
  Searchable: boolean;
  Highlight: boolean;
  DateFrom: string;
  DateTo: string;
  TotalProducts: number;
  Type: "Manual" | "Automatic" | "Hybrid";
}

export interface CollectionListItem {
  id: number;
  name: string;
  searchable: boolean;
  highlight: boolean;
  dateFrom: string;
  dateTo: string;
  totalSku: number;
  totalProducts: number;
  type: "Manual" | "Automatic" | "Hybrid";
  lastModifiedBy: string | null;
}

export interface CollectionListResponse {
  paging: {
    page: number;
    perPage: number;
    total: number;
    pages: number;
  };
  items: CollectionListItem[];
}

export interface CreateCollectionInput {
  Name: string;
  Description?: string;
  Searchable?: boolean;
  Highlight?: boolean;
  DateFrom: string;
  DateTo: string;
}

export interface CollectionProduct {
  ProductId: number;
  SkuId: number;
  Position: number;
  ProductName: string;
  SkuImageUrl: string;
}

export interface CollectionProductsResponse {
  Data: CollectionProduct[];
  Page: number;
  Size: number;
  TotalRows: number;
  TotalPage: number;
}

export interface CollectionImportResponse {
  TotalItemProcessed: number;
  TotalErrorsProcessed: number;
  TotalProductsProcessed: number;
  Errors: string[];
}

export interface AddSkuToCollectionInput {
  SkuId: number;
}

// ============ SPECIFICATION TYPES ============

export interface ProductSpecification {
  Id: number;
  Name: string;
  Value: string[];
}

// ============ SKU FILE/IMAGE TYPES ============

export interface SkuFile {
  Id: number;
  ArchiveId: number;
  SkuId: number;
  Name: string;
  IsMain: boolean;
  Label: string | null;
  Url: string;
}
