// src/modules/resource/services/management/resource-type.service.ts
import {
    Injectable,
    ConflictException,
    NotFoundException,
    BadRequestException,
  } from '@nestjs/common';
  import { ResourceTypeRepository, ResourceRepository } from '@modules/resource/repositories';
  import { LoggerService } from '@shared/services/logger.service';
  import {
    CreateResourceTypeDto,
    UpdateResourceTypeDto,
    ResourceTypeResponseDto,
  } from '@modules/resource/dto';
  import { ResourceTypeDocument } from '@modules/resource/models';
  import { MongoUtils } from '@shared/utils';
  
  @Injectable()
  export class ResourceTypeService {
    constructor(
      private readonly resourceTypeRepository: ResourceTypeRepository,
      private readonly resourceRepository: ResourceRepository,
      private readonly logger: LoggerService,
    ) {
      this.logger.setContext('ResourceTypeService');
    }
  
    async create(createResourceTypeDto: CreateResourceTypeDto): Promise<ResourceTypeResponseDto> {
      const { name, description } = createResourceTypeDto;
  
      try {
        // Verificar si ya existe
        const existingType = await this.resourceTypeRepository.findByName(name);
        if (existingType) {
          throw new ConflictException('Ya existe un tipo de recurso con este nombre');
        }
  
        const resourceTypeData = {
          name,
          description: description.trim(),
          active: true,
        };
  
        const createdType = await this.resourceTypeRepository.create(resourceTypeData);
        this.logger.log(`Resource type created successfully: ${name}`);
  
        return this.mapToResponseDto(createdType);
      } catch (error) {
        if (error instanceof ConflictException) {
          throw error;
        }
  
        this.logger.error(`Error creating resource type: ${name}`, error);
        throw new BadRequestException('Error al crear el tipo de recurso');
      }
    }
  
    async findById(id: string): Promise<ResourceTypeResponseDto> {
      if (!MongoUtils.isValidObjectId(id)) {
        throw new BadRequestException('ID de tipo de recurso inválido');
      }
  
      const resourceType = await this.resourceTypeRepository.findById(id);
      if (!resourceType) {
        throw new NotFoundException('Tipo de recurso no encontrado');
      }
  
      return this.mapToResponseDto(resourceType);
    }
  
    async findAllActive(): Promise<ResourceTypeResponseDto[]> {
      const resourceTypes = await this.resourceTypeRepository.findAllActive();
      return resourceTypes.map(type => this.mapToResponseDto(type));
    }
  
    async update(id: string, updateResourceTypeDto: UpdateResourceTypeDto): Promise<ResourceTypeResponseDto> {
      if (!MongoUtils.isValidObjectId(id)) {
        throw new BadRequestException('ID de tipo de recurso inválido');
      }
  
      const existingType = await this.resourceTypeRepository.findById(id);
      if (!existingType) {
        throw new NotFoundException('Tipo de recurso no encontrado');
      }
  
      try {
        const updateData: any = {};
  
        if (updateResourceTypeDto.description) {
          updateData.description = updateResourceTypeDto.description.trim();
        }
  
        if (updateResourceTypeDto.active !== undefined) {
          updateData.active = updateResourceTypeDto.active;
        }
  
        const updatedType = await this.resourceTypeRepository.update(id, updateData);
        if (!updatedType) {
          throw new NotFoundException('Tipo de recurso no encontrado');
        }
  
        this.logger.log(`Resource type updated successfully: ${updatedType.name}`);
        return this.mapToResponseDto(updatedType);
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw error;
        }
  
        this.logger.error(`Error updating resource type: ${id}`, error);
        throw new BadRequestException('Error al actualizar el tipo de recurso');
      }
    }
  
    async activate(id: string): Promise<ResourceTypeResponseDto> {
      if (!MongoUtils.isValidObjectId(id)) {
        throw new BadRequestException('ID de tipo de recurso inválido');
      }
  
      const activatedType = await this.resourceTypeRepository.activate(id);
      if (!activatedType) {
        throw new NotFoundException('Tipo de recurso no encontrado');
      }
  
      this.logger.log(`Resource type activated: ${activatedType.name}`);
      return this.mapToResponseDto(activatedType);
    }
  
    async deactivate(id: string): Promise<ResourceTypeResponseDto> {
      if (!MongoUtils.isValidObjectId(id)) {
        throw new BadRequestException('ID de tipo de recurso inválido');
      }
  
      const deactivatedType = await this.resourceTypeRepository.deactivate(id);
      if (!deactivatedType) {
        throw new NotFoundException('Tipo de recurso no encontrado');
      }
  
      this.logger.log(`Resource type deactivated: ${deactivatedType.name}`);
      return this.mapToResponseDto(deactivatedType);
    }
  
    async delete(id: string): Promise<void> {
      if (!MongoUtils.isValidObjectId(id)) {
        throw new BadRequestException('ID de tipo de recurso inválido');
      }
  
      const resourceType = await this.resourceTypeRepository.findById(id);
      if (!resourceType) {
        throw new NotFoundException('Tipo de recurso no encontrado');
      }
  
      // Verificar que no tenga recursos asociados
      const resourceCount = await this.resourceRepository.count({ typeId: id });
      if (resourceCount > 0) {
        throw new BadRequestException(
          `No se puede eliminar el tipo de recurso porque tiene ${resourceCount} recursos asociados`
        );
      }
  
      await this.resourceTypeRepository.delete(id);
      this.logger.log(`Resource type deleted permanently: ${resourceType.name}`);
    }
  
    private mapToResponseDto(resourceType: ResourceTypeDocument): ResourceTypeResponseDto {
      return {
        _id: (resourceType._id as any).toString(),
        name: resourceType.name,
        description: resourceType.description,
        active: resourceType.active,
        createdAt: resourceType.createdAt,
        updatedAt: resourceType.updatedAt,
      };
    }
  }