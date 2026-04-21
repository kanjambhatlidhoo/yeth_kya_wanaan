export class ResponseObject {
    private statusCode: number;
    private status: string;
    private description: string;
    private data: any;

    public constructor(statusCode: number, status: string, description: string, data: any) {
        this.statusCode = statusCode;
        this.status = status;
        this.description = description;
        this.data = data;
    }

    getStatusCode() : number {
        return this.statusCode;
    }

    getStatus() : string {
        return this.status;
    }

    getDescription() : string {
        return this.description;
    }

    getData(): any {
        return this.data;
    }

}