import { UserRepository } from 'src/repositories/user.repository';

export class SafeFotoFamilyPolicyService {
  constructor(private userRepository: UserRepository) {}

  getDiscoverableUsers(userId: string) {
    return this.userRepository.getByHousehold(userId);
  }

  getDiscoverableUser(userId: string, targetUserId: string) {
    return this.userRepository.getInHousehold(userId, targetUserId);
  }
}
