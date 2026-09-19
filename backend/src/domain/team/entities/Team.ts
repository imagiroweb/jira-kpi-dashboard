import mongoose, { Document, Schema } from 'mongoose';

/**
 * Équipe (ex. "Choco", "Calson", "Cook", "QA", "Front").
 *
 * Le rattachement d'un collaborateur à une équipe est modulable : voir
 * `User.teamId`, modifiable à tout moment (changement d'équipe), et
 * `User.canManageTeamAssignment` pour le droit délégué par le CTO à un lead.
 *
 * Une équipe peut avoir un ou plusieurs leads (`leadIds`). Un lead voit
 * l'ensemble des fiches de performance des collaborateurs dont
 * `teamId` pointe vers une équipe où il apparaît dans `leadIds`.
 */
export interface ITeam extends Document {
  name: string;
  leadIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema = new Schema<ITeam>(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    leadIds: {
      type: [Schema.Types.ObjectId],
      ref: 'User',
      default: []
    }
  },
  { timestamps: true }
);

TeamSchema.index({ name: 1 }, { unique: true });
TeamSchema.index({ leadIds: 1 });

export const Team = mongoose.model<ITeam>('Team', TeamSchema);
