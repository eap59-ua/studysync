import type { User } from "../../types/auth";

interface MemberListProps {
  members: User[];
}

export function MemberList({ members }: MemberListProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-4">
        Conectados ({members.length})
      </h3>
      <ul className="space-y-3">
        {members.map((member) => {
          // Utilizar la inicial del display_name
          const initial = member.display_name.charAt(0).toUpperCase() || "?";
          return (
            <li key={member.id} className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100">
                  <span className="text-sm font-medium leading-none text-indigo-700">
                    {initial}
                  </span>
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {member.display_name}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {members.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">
          Nadie por aquí...
        </p>
      )}
    </div>
  );
}
