// src/modules/resource/repositories/resource.repository.ts - ACTUALIZADO CON GESTIÓN DE STOCK
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Resource, ResourceDocument } from '@modules/resource/models';
import { BaseRepositoryImpl } from '@shared/repositories';
import { LoggerService } from '@shared/services/logger.service';
import { MongoUtils, getErrorMessage, getErrorStack } from '@shared/utils';

@Injectable()
export class ResourceRepository extends BaseRepositoryImpl<ResourceDocument> {
  constructor(
    @InjectModel(Resource.name) private resourceModel: Model<ResourceDocument>,
    private readonly logger: LoggerService,
  ) {
    super(resourceModel);
    this.logger.setContext('ResourceRepository');
  }

  // ✅ MÉTODOS EXISTENTES MANTENIDOS

  /**
   * Buscar por ID con populate completo
   */
  async findByIdWithPopulate(id: string): Promise<ResourceDocument | null> {
    try {
      if (!MongoUtils.isValidObjectId(id)) {
        return null;
      }

      return await this.resourceModel
        .findById(id)
        .populate([
          { path: 'typeId', select: 'name description' },
          { path: 'categoryId', select: 'name description color' },
          { path: 'authorIds', select: 'name' },
          { path: 'publisherId', select: 'name' },
          { path: 'stateId', select: 'name description color' },
          { path: 'locationId', select: 'name description' }
        ])
        .exec();
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Error finding resource by ID with populate: ${id}`, {
        error: errorMessage,
        stack: getErrorStack(error)
      });
      return null;
    }
  }

  /**
   * Buscar recursos con filtros
   */
  async findWithFilters(filters: any): Promise<ResourceDocument[]> {
    try {
      const query: any = {};

      if (filters.search) {
        query.$text = { $search: filters.search };
      }

      if (filters.typeId) {
        query.typeId = new Types.ObjectId(filters.typeId);
      }

      if (filters.categoryId) {
        query.categoryId = new Types.ObjectId(filters.categoryId);
      }

      if (filters.available !== undefined) {
        query.available = filters.available;
      }

      if (filters.stateId) {
        query.stateId = new Types.ObjectId(filters.stateId);
      }

      // ✅ NUEVO: Filtro por stock disponible
      if (filters.hasStock !== undefined) {
        if (filters.hasStock) {
          query.$expr = {
            $gt: [
              { $subtract: ['$totalQuantity', '$currentLoansCount'] },
              0
            ]
          };
        } else {
          query.$expr = {
            $lte: [
              { $subtract: ['$totalQuantity', '$currentLoansCount'] },
              0
            ]
          };
        }
      }

      return await this.resourceModel
        .find(query)
        .populate([
          { path: 'typeId', select: 'name description' },
          { path: 'categoryId', select: 'name description color' },
          { path: 'authorIds', select: 'name' },
          { path: 'publisherId', select: 'name' },
          { path: 'stateId', select: 'name description color' },
          { path: 'locationId', select: 'name description' }
        ])
        .sort({ title: 1 })
        .exec();
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error('Error finding resources with filters', {
        error: errorMessage,
        stack: getErrorStack(error),
        filters
      });
      return [];
    }
  }

  /**
   * Actualizar disponibilidad
   */
  async updateAvailability(id: string, available: boolean): Promise<ResourceDocument | null> {
    try {
      if (!MongoUtils.isValidObjectId(id)) {
        return null;
      }

      return await this.resourceModel
        .findByIdAndUpdate(
          id,
          { available },
          { new: true }
        )
        .exec();
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Error updating availability for resource: ${id}`, {
        error: errorMessage,
        stack: getErrorStack(error),
        available
      });
      return null;
    }
  }

  // ✅ NUEVOS MÉTODOS PARA GESTIÓN DE STOCK

  /**
   * ✅ NUEVO: Incrementar contador de préstamos actuales
   */
  async incrementCurrentLoans(resourceId: string, quantity: number = 1): Promise<boolean> {
    try {
      if (!MongoUtils.isValidObjectId(resourceId)) {
        return false;
      }

      const result = await this.resourceModel
        .findByIdAndUpdate(
          resourceId,
          { 
            $inc: { 
              currentLoansCount: quantity,
              totalLoans: quantity
            },
            $set: {
              lastLoanDate: new Date()
            }
          },
          { new: true }
        )
        .exec();

      if (result) {
        this.logger.debug(`Incremented loans for resource ${resourceId}: +${quantity} (total: ${result.currentLoansCount})`);
        return true;
      }

      return false;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Error incrementing current loans for resource: ${resourceId}`, {
        error: errorMessage,
        stack: getErrorStack(error),
        quantity
      });
      return false;
    }
  }

  /**
   * ✅ NUEVO: Decrementar contador de préstamos actuales
   */
  async decrementCurrentLoans(resourceId: string, quantity: number = 1): Promise<boolean> {
    try {
      if (!MongoUtils.isValidObjectId(resourceId)) {
        return false;
      }

      const result = await this.resourceModel
        .findByIdAndUpdate(
          resourceId,
          { 
            $inc: { 
              currentLoansCount: -quantity
            }
          },
          { new: true }
        )
        .exec();

      if (result) {
        // Asegurar que no sea negativo
        if (result.currentLoansCount < 0) {
          await this.resourceModel
            .findByIdAndUpdate(
              resourceId,
              { currentLoansCount: 0 },
              { new: true }
            )
            .exec();
          
          this.logger.warn(`Reset negative currentLoansCount for resource ${resourceId}`);
        }

        this.logger.debug(`Decremented loans for resource ${resourceId}: -${quantity} (total: ${Math.max(0, result.currentLoansCount)})`);
        return true;
      }

      return false;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Error decrementing current loans for resource: ${resourceId}`, {
        error: errorMessage,
        stack: getErrorStack(error),
        quantity
      });
      return false;
    }
  }

  /**
   * ✅ NUEVO: Obtener información de stock de un recurso
   */
  async getStockInfo(resourceId: string): Promise<{
    totalQuantity: number;
    currentLoansCount: number;
    availableQuantity: number;
    hasStock: boolean;
  } | null> {
    try {
      if (!MongoUtils.isValidObjectId(resourceId)) {
        return null;
      }

      const resource = await this.resourceModel
        .findById(resourceId, 'totalQuantity currentLoansCount available')
        .exec();

      if (!resource) {
        return null;
      }

      const availableQuantity = Math.max(0, resource.totalQuantity - resource.currentLoansCount);

      return {
        totalQuantity: resource.totalQuantity,
        currentLoansCount: resource.currentLoansCount,
        availableQuantity,
        hasStock: resource.available && availableQuantity > 0
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Error getting stock info for resource: ${resourceId}`, {
        error: errorMessage,
        stack: getErrorStack(error)
      });
      return null;
    }
  }

  /**
   * ✅ NUEVO: Sincronizar contador de préstamos con datos reales
   */
  async syncCurrentLoansCount(resourceId: string, realCurrentLoans: number): Promise<boolean> {
    try {
      if (!MongoUtils.isValidObjectId(resourceId)) {
        return false;
      }

      const result = await this.resourceModel
        .findByIdAndUpdate(
          resourceId,
          { currentLoansCount: Math.max(0, realCurrentLoans) },
          { new: true }
        )
        .exec();

      if (result) {
        this.logger.debug(`Synced currentLoansCount for resource ${resourceId}: ${realCurrentLoans}`);
        return true;
      }

      return false;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Error syncing current loans count for resource: ${resourceId}`, {
        error: errorMessage,
        stack: getErrorStack(error),
        realCurrentLoans
      });
      return false;
    }
  }

  /**
   * ✅ NUEVO: Buscar recursos con stock disponible
   */
  async findResourcesWithStock(limit?: number): Promise<ResourceDocument[]> {
    try {
      let query = this.resourceModel
        .find({
          available: true,
          $expr: {
            $gt: [
              { $subtract: ['$totalQuantity', '$currentLoansCount'] },
              0
            ]
          }
        })
        .populate([
          { path: 'typeId', select: 'name description' },
          { path: 'categoryId', select: 'name description color' },
          { path: 'authorIds', select: 'name' },
          { path: 'stateId', select: 'name description color' }
        ])
        .sort({ title: 1 });

      if (limit && limit > 0) {
        query = query.limit(limit);
      }

      return await query.exec();
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error('Error finding resources with stock', {
        error: errorMessage,
        stack: getErrorStack(error),
        limit
      });
      return [];
    }
  }

  /**
   * ✅ NUEVO: Buscar recursos sin stock
   */
  async findResourcesWithoutStock(): Promise<ResourceDocument[]> {
    try {
      return await this.resourceModel
        .find({
          $or: [
            { available: false },
            {
              $expr: {
                $lte: [
                  { $subtract: ['$totalQuantity', '$currentLoansCount'] },
                  0
                ]
              }
            }
          ]
        })
        .populate([
          { path: 'typeId', select: 'name description' },
          { path: 'categoryId', select: 'name description color' },
          { path: 'authorIds', select: 'name' },
          { path: 'stateId', select: 'name description color' }
        ])
        .sort({ title: 1 })
        .exec();
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error('Error finding resources without stock', {
        error: errorMessage,
        stack: getErrorStack(error)
      });
      return [];
    }
  }

  /**
   * ✅ NUEVO: Actualizar cantidad total de un recurso
   */
  async updateTotalQuantity(resourceId: string, newTotalQuantity: number): Promise<ResourceDocument | null> {
    try {
      if (!MongoUtils.isValidObjectId(resourceId)) {
        return null;
      }

      if (newTotalQuantity < 1) {
        throw new Error('La cantidad total debe ser mayor a 0');
      }

      const resource = await this.resourceModel.findById(resourceId).exec();
      if (!resource) {
        throw new Error('Recurso no encontrado');
      }

      // Verificar que la nueva cantidad no sea menor a los préstamos actuales
      if (newTotalQuantity < resource.currentLoansCount) {
        throw new Error(
          `La nueva cantidad (${newTotalQuantity}) no puede ser menor a los préstamos actuales (${resource.currentLoansCount})`
        );
      }

      const result = await this.resourceModel
        .findByIdAndUpdate(
          resourceId,
          { totalQuantity: newTotalQuantity },
          { new: true }
        )
        .exec();

      if (result) {
        this.logger.debug(`Updated total quantity for resource ${resourceId}: ${newTotalQuantity}`);
      }

      return result;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Error updating total quantity for resource: ${resourceId}`, {
        error: errorMessage,
        stack: getErrorStack(error),
        newTotalQuantity
      });
      return null;
    }
  }

  /**
   * ✅ NUEVO: Obtener estadísticas de stock general
   */
  async getStockStatistics(): Promise<{
    totalResources: number;
    resourcesWithStock: number;
    resourcesWithoutStock: number;
    totalUnits: number;
    loanedUnits: number;
    availableUnits: number;
  }> {
    try {
      const result = await this.resourceModel
        .aggregate([
          {
            $group: {
              _id: null,
              totalResources: { $sum: 1 },
              resourcesWithStock: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$available', true] },
                        { $gt: [{ $subtract: ['$totalQuantity', '$currentLoansCount'] }, 0] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              resourcesWithoutStock: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ['$available', false] },
                        { $lte: [{ $subtract: ['$totalQuantity', '$currentLoansCount'] }, 0] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              totalUnits: { $sum: '$totalQuantity' },
              loanedUnits: { $sum: '$currentLoansCount' },
              availableUnits: {
                $sum: { $subtract: ['$totalQuantity', '$currentLoansCount'] }
              }
            }
          }
        ])
        .exec();

      if (result.length > 0) {
        return result[0];
      }

      return {
        totalResources: 0,
        resourcesWithStock: 0,
        resourcesWithoutStock: 0,
        totalUnits: 0,
        loanedUnits: 0,
        availableUnits: 0
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error('Error getting stock statistics', {
        error: errorMessage,
        stack: getErrorStack(error)
      });
      return {
        totalResources: 0,
        resourcesWithStock: 0,
        resourcesWithoutStock: 0,
        totalUnits: 0,
        loanedUnits: 0,
        availableUnits: 0
      };
    }
  }

  /**
   * Buscar recurso por ISBN
   */
  async findByISBN(isbn: string): Promise<ResourceDocument | null> {
    try {
      if (!isbn) return null;
      return await this.resourceModel.findOne({ isbn }).exec();
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Error finding resource by ISBN: ${isbn}`, {
        error: errorMessage,
        stack: getErrorStack(error)
      });
      return null;
    }
  }

  /**
   * Contar recursos por autor
   */
  async countByAuthor(authorId: string): Promise<number> {
    return this.resourceModel.countDocuments({ authorIds: authorId }).exec();
  }

  /**
   * Contar recursos por categoría
   */
  async countByCategory(categoryId: string): Promise<number> {
    return this.resourceModel.countDocuments({ categoryId }).exec();
  }

  /**
   * Contar recursos por ubicación
   */
  async countByLocation(locationId: string): Promise<number> {
    return this.resourceModel.countDocuments({ locationId }).exec();
  }
}